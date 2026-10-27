import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { inline, Markdown } from "../lib/markdown";
import { lang, LANGS, rich, setLang, t } from "../lib/i18n";
import type { Recipe, SiteDetail, State } from "../lib/types";
import { ChangePassword } from "./Password";
import { ago, ConnectSteps } from "./Start";
import { TurnOnUpdates } from "./TurnOnUpdates";

type Ver = { id: number; note: string; via: string; created_at: number };

const VIA = { ai: "Your AI", owner: "You", start: "First version", chat: "Claude" } as Record<string, string>;
const via = (v: string) => (VIA[v] ? t(VIA[v]) : v);
const when = (n: number) => new Date(n).toLocaleString(lang, { dateStyle: "short", timeStyle: "short" });

// saved: what to say once it worked, when it isn't live yet (a change to the page waits for Publish).
export function Form({ title, children, onSave, help, saved }: { title: string; children: React.ReactNode; onSave: () => Promise<void>; help?: React.ReactNode; saved?: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="page-section"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSave();
          setMsg({ ok: true, text: saved ?? t("Saved.") });
        } catch (err) {
          setMsg({ ok: false, text: (err as Error).message });
        }
        setBusy(false);
      }}
    >
      <h2>{title}</h2>
      {help && <p className="lead">{help}</p>}
      <div className="field-stack">{children}</div>
      <div className="field-actions">
        <button className="btn btn--ink" type="submit" disabled={busy}>{busy ? t("Saving") : t("Save")}</button>
      </div>
      <p className={msg && !msg.ok ? "help help--error" : "help"} role="status">{msg?.text ?? ""}</p>
    </form>
  );
}

// Every version of a site, newest first, for the editor's History panel.
export function History({ site, onSite }: { site: SiteDetail; onSite: (s: SiteDetail) => void }) {
  const at = `/api/sites/${site.id}`;
  const [hist, setHist] = useState<{ versions: Ver[] } | null>(null);
  useEffect(() => {
    api<typeof hist>(`${at}/history`).then(setHist, () => {});
  }, [site.draft]);
  return (
    <ul className="versions">
      {hist?.versions.map((v) => (
        <li key={v.id}>
          <span className="muted">{when(v.created_at)}</span> <strong>{via(v.via)}</strong>: {v.note}
          {v.id === site.published && <span className="tag">{t("live")}</span>}
          {v.id !== site.draft && (
            <button type="button" className="link-btn" onClick={async () => onSite(await api<SiteDetail>(`${at}/restore/${v.id}`, { method: "POST" }))}>
              {t("Go back to this")}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

// The settings of one site: what it's connected to, then what can't be undone.
export function SiteSettings({ site, builder, onSite, onDeleted }: { site: SiteDetail; builder: State; onSite: (s: SiteDetail) => void; onDeleted: (s: State) => void }) {
  const at = `/api/sites/${site.id}`;
  const [statsId, setStatsId] = useState(site.analytics_site);
  const [confirm, setConfirm] = useState("");
  const [gone, setGone] = useState<string | null>(null);

  return (
    <div className="settings">
      <h2 className="group-h">{t("Connections")}</h2>
      <Form
        title={t("Visitors")}
        help={
          builder.analytics_url
            ? t("Count this site's visitors and contact messages with Dozokit Analytics: add this site there, then paste its site id.")
            : t("Count this site's visitors with Dozokit Analytics, free, in your own Cloudflare account too. First type its address once in Settings (top right) → Connections, then paste this site's id here.")
        }
        onSave={async () => onSite(await api<SiteDetail>(`${at}/settings`, { method: "PUT", body: JSON.stringify({ analytics_site: statsId }) }))}
      >
        <label className="field">
          <span>{t("This site's id in Dozokit Analytics")}</span>
          <input value={statsId} onChange={(e) => setStatsId(e.target.value)} spellCheck={false} />
        </label>
      </Form>

      <h2 className="group-h">{t("Keep or remove")}</h2>
      <section className="page-section">
        <h2>{t("Download this site")}</h2>
        <p className="lead">{t("As plain files (HTML, photos, sitemap), to keep a copy or host it anywhere else.")}</p>
        <a className="btn btn--card" href={`${at}/download`}>{t("Download a .zip")}</a>
      </section>

      <form
        className="page-section danger"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            onDeleted(await api<State>(at, { method: "DELETE", body: JSON.stringify({ confirm }) }));
          } catch (err) {
            setGone((err as Error).message);
          }
        }}
      >
        <h2>{t("Delete this site")}</h2>
        <p className="lead">{t("This removes the site, every version of it and its messages. It can't be undone: download it first if you may want it back.")}</p>
        <div className="field-stack">
          <label className="field">
            <span>{t("Type “{name}” to confirm", { name: site.doc.business.name })}</span>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </label>
        </div>
        <div className="field-actions">
          <button className="btn btn--danger" type="submit" disabled={confirm !== site.doc.business.name}>{t("Delete the site")}</button>
        </div>
        <p className="help help--error" role="alert">{gone ?? ""}</p>
      </form>
    </div>
  );
}

// What every site shares: the chat apps, email, help, the maker, the password.
type Use = { day: string; browser_minutes: number; requests?: number; rows_read?: number; rows_written?: number; limits: Record<"requests" | "rows_read" | "rows_written" | "browser_minutes", number>; token_link: string; connected: boolean; error?: string };

// Today's use of the owner's Cloudflare account against the free plan. Requests and database
// rows need a read-only token pasted once; browser time the builder counts itself.
function Usage() {
  const [use, setUse] = useState<Use | null>(null);
  const [token, setToken] = useState("");
  const [account, setAccount] = useState("");
  useEffect(() => {
    api<Use>("/api/usage").then(setUse, () => {});
  }, []);
  if (!use) return null;
  const row = (label: string, n: number | undefined, max: number, unit = "") => (
    <tr>
      <th scope="row">{label}</th>
      <td>{n === undefined ? "—" : `${n.toLocaleString(lang)}${unit}`}</td>
      <td className="muted">/ {max.toLocaleString(lang)}{unit}</td>
      <td>{n !== undefined && <meter min={0} max={max} low={max * 0.7} high={max * 0.9} optimum={0} value={n} />}</td>
    </tr>
  );
  const put = async (value: string, id = "") => setUse(await api<Use>("/api/usage", { method: "PUT", body: JSON.stringify({ token: value, account: id }) }));
  return (
    <section className="page-section">
      <h2>{t("Today on Cloudflare's free plan")}</h2>
      <p className="lead">{t("Counted since midnight UTC, when every limit starts again, for your whole Cloudflare account. Going over stops that part until then; nothing is charged.")}</p>
      <table className="usage">
        <tbody>
          {row(t("Visits and requests"), use.requests, use.limits.requests)}
          {row(t("Database rows read"), use.rows_read, use.limits.rows_read)}
          {row(t("Database rows written"), use.rows_written, use.limits.rows_written)}
          {row(t("Screenshots for Claude (minutes)"), use.browser_minutes, use.limits.browser_minutes)}
        </tbody>
      </table>
      <p className="help">{t("Screenshot minutes are counted by Dozokit Sites itself; Cloudflare's own count may differ a little.")}</p>
      {use.error && <p className="help help--error">{use.error}</p>}
      {use.connected ? (
        <button type="button" className="btn btn--quiet" onClick={() => put("")}>
          {t("Remove the Cloudflare token")}
        </button>
      ) : (
        <Form title={t("See requests and database use")} onSave={() => put(token, account).then(() => (setToken(""), setAccount("")))} help={inline(t("Create a read-only token in Cloudflare ([this link fills it in]({link}): click **Continue to summary**, then **Create Token**), copy it and paste it here. It can only read your account's statistics.", { link: use.token_link }))}>
          <label className="field">
            <span>{t("Cloudflare token")}</span>
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
          <label className="field">
            <span>{t("Account ID (only if asked)")}</span>
            <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="023e105f4ecef8ad9ca31a8372d0c353" autoComplete="off" spellCheck={false} />
          </label>
        </Form>
      )}
    </section>
  );
}

export function BuilderSettings({ state, onState, passwordRequired, version, part }: { state: State; onState: (s: State) => void; passwordRequired: boolean; version?: string; part?: string }) {
  const [mailTo, setMailTo] = useState(state.email.to);
  const [statsUrl, setStatsUrl] = useState(state.analytics_url);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  useEffect(() => {
    api<Recipe[]>(`/api/recipes?lang=${lang}`).then(setRecipes, () => {});
  }, []);
  // Opened at a group (#settings/help): scroll there once the page is drawn.
  useEffect(() => {
    if (part) document.getElementById(part)?.scrollIntoView();
  }, [part]);
  const jump = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    history.replaceState(null, "", `#settings/${id}`);
    document.getElementById(id)?.scrollIntoView();
  };
  const put = async (data: object) => onState(await api<State>("/api/settings", { method: "PUT", body: JSON.stringify(data) }));
  const mail = `mailto:contact@dozokit.com?subject=${encodeURIComponent(t("Dozokit Sites: an idea or a question"))}&body=${encodeURIComponent(t("Version {v}\n\nWhat I wanted to do:\n\nWhat happened:\n", { v: version ?? "?" }))}`;

  return (
    <div className="settings-grid">
      <nav className="settings-nav" aria-label={t("Settings")}>
        <a href="#settings/connections" onClick={jump("connections")}>{t("Connections")}</a>
        <a href="#settings/usage" onClick={jump("usage")}>{t("Usage")}</a>
        <a href="#settings/help" onClick={jump("help")}>{t("Help")}</a>
        <a href="#settings/account" onClick={jump("account")}>{t("Account")}</a>
      </nav>
    <div className="settings">
      <h2 className="group-h" id="connections">{t("Connections")}</h2>
      <section className="page-section">
        <h2>{t("Claude and other chat apps")}</h2>
        <p className="lead">{t("Claude (or ChatGPT) builds and changes your sites on your own plan, through the Dozokit Sites connector.")}</p>
        <details className="qa" open={state.chat_apps.length === 0}>
          <summary>{t("How to connect Claude")}</summary>
          <ConnectSteps />
        </details>
        {state.chat_apps.length > 0 && (
          <ul className="checks">
            {state.chat_apps.map((c) => (
              <li key={c.id} className="ok">
                {c.name} <span className="help">{t("connected {when}", { when: when(c.created_at) })} · {c.last_used ? t("last used {when}", { when: ago(c.last_used) }) : t("not used yet")}</span>{" "}
                <button type="button" className="link-btn" onClick={async () => onState(await api<State>(`/api/chat-apps/${c.id}`, { method: "DELETE" }))}>
                  {t("Disconnect")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="page-section">
        <h2>{t("Messages by email")}</h2>
        <p className="lead">
          {state.email.connected
            ? t("Resend is connected: each message from any of your sites' contact forms also arrives in your mailbox.")
            : t("Only for sites with a contact form. Get each message in your mailbox through your own free Resend account: type the email of that account, then connect it.")}
        </p>
        <form
          className="field-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await put({ notify_to: mailTo });
              if (!state.email.connected) location.assign((await api<{ url: string }>("/api/resend/start", { method: "POST" })).url);
              else setTest({ ok: true, text: t("Saved.") });
            } catch (err) {
              setTest({ ok: false, text: (err as Error).message });
            }
          }}
        >
          <label className="field">
            <span>{t("Your email (the one you use, or will use, on resend.com)")}</span>
            <input type="email" required value={mailTo} onChange={(e) => setMailTo(e.target.value)} placeholder={t("you@example.com")} />
          </label>
          <div className="field-actions">
            <button className="btn btn--ink" type="submit">{state.email.connected ? t("Save") : t("Connect Resend")}</button>
            {state.email.connected && (
              <>
                <button
                  type="button"
                  className="btn btn--quiet"
                  onClick={async () => {
                    try {
                      onState(await api<State>("/api/email/test", { method: "POST" }));
                      setTest({ ok: true, text: t("Sent. Check {email}.", { email: state.email.to }) });
                    } catch (err) {
                      setTest({ ok: false, text: (err as Error).message });
                    }
                  }}
                >
                  {t("Send a test")}
                </button>
                <button type="button" className="link-btn" onClick={async () => onState(await api<State>("/api/resend", { method: "DELETE" }))}>
                  {t("Disconnect")}
                </button>
              </>
            )}
          </div>
          <p className={test && !test.ok ? "help help--error" : "help"} role="status">
            {test?.text ?? (state.email.last && state.email.last !== "200" ? t("The last email didn't go through: send a test to see why.") : state.email.connected ? "" : t("Resend opens: sign up with that same email if you don't have an account, then click Allow."))}
          </p>
        </form>
      </section>

      <Form
        title={t("Visitors")}
        help={t("Your Dozokit Analytics address, the same for all your sites. Each site's own id goes in its Site settings.")}
        onSave={async () => put({ analytics_url: statsUrl })}
      >
        <label className="field">
          <span>{t("Dozokit Analytics address")}</span>
          <input value={statsUrl} onChange={(e) => setStatsUrl(e.target.value)} placeholder="https://dozokit-analytics.your-name.workers.dev" spellCheck={false} />
        </label>
      </Form>

      <h2 className="group-h" id="usage">{t("Usage")}</h2>
      <Usage />

      <h2 className="group-h" id="help">{t("Help")}</h2>
      <section className="page-section">
        <h2>{t("Step by step")}</h2>
        {recipes.map((r) => (
          <details key={r.id} className="qa" id={r.id}>
            <summary>{r.title}</summary>
            <Markdown text={r.body} />
          </details>
        ))}
      </section>

      <section className="page-section">
        <h2>{t("Talk to the maker")}</h2>
        <p className="lead">{t("Missing something, stuck, or an idea? Write to Ludo, who builds Dozokit Sites. You get an answer by email, and the most asked things become ready-made answers in the next version.")}</p>
        <a className="btn btn--card" href={mail}>{t("Write to Ludo")}</a>
      </section>

      <h2 className="group-h" id="account">{t("Account")}</h2>
      <section className="page-section">
        <h2>{t("Language")}</h2>
        <div className="seg" role="group" aria-label={t("Language")}>
          {LANGS.map(([l, name]) => (
            <button key={l} type="button" aria-pressed={l === lang} onClick={() => l !== lang && setLang(l)}>
              {name}
            </button>
          ))}
        </div>
        <p className="help">{t("For these screens. Each site's own languages are set in the site itself.")}</p>
      </section>
      {passwordRequired && (
        <section className="page-section">
          <ChangePassword />
        </section>
      )}

      <section className="page-section">
        <h2 id="updates">{t("Updates")}</h2>
        <TurnOnUpdates />
      </section>

      <section className="page-section">
        <h2>{t("Version")}</h2>
        <p className="help">Dozokit Sites {version}.</p>
      </section>
    </div>
    </div>
  );
}
