import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Markdown } from "../lib/markdown";
import type { Recipe, SiteDetail, State } from "../lib/types";
import { ChangePassword } from "./Password";
import { ago, ConnectSteps } from "./Start";
import { TurnOnUpdates } from "./TurnOnUpdates";

type Ver = { id: number; note: string; via: string; created_at: number };

const VIA = { ai: "Your AI", owner: "You", start: "First version", chat: "Claude" } as Record<string, string>;
const when = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });

export function Form({ title, children, onSave, help }: { title: string; children: React.ReactNode; onSave: () => Promise<void>; help?: React.ReactNode }) {
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
          setMsg({ ok: true, text: "Saved." });
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
        <button className="btn btn--ink" type="submit" disabled={busy}>{busy ? "Saving" : "Save"}</button>
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
          <span className="muted">{when(v.created_at)}</span> <strong>{VIA[v.via] ?? v.via}</strong>: {v.note}
          {v.id === site.published && <span className="tag">live</span>}
          {v.id !== site.draft && (
            <button type="button" className="link-btn" onClick={async () => onSite(await api<SiteDetail>(`${at}/restore/${v.id}`, { method: "POST" }))}>
              Go back to this
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
      <h2 className="group-h">Connections</h2>
      <Form
        title="Visitors"
        help={
          builder.analytics_url
            ? "Count this site's visitors and contact messages with Dozokit Analytics: add this site there, then paste its site id."
            : "Count this site's visitors with Dozokit Analytics, free, in your own Cloudflare account too. First type its address once in Settings (top right) → Connections, then paste this site's id here."
        }
        onSave={async () => onSite(await api<SiteDetail>(`${at}/settings`, { method: "PUT", body: JSON.stringify({ analytics_site: statsId }) }))}
      >
        <label className="field">
          <span>This site's id in Dozokit Analytics</span>
          <input value={statsId} onChange={(e) => setStatsId(e.target.value)} spellCheck={false} />
        </label>
      </Form>

      <h2 className="group-h">Keep or remove</h2>
      <section className="page-section">
        <h2>Download this site</h2>
        <p className="lead">As plain files (HTML, photos, sitemap), to keep a copy or host it anywhere else.</p>
        <a className="btn btn--card" href={`${at}/download`}>Download a .zip</a>
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
        <h2>Delete this site</h2>
        <p className="lead">This removes the site, every version of it and its messages. It can't be undone: download it first if you may want it back.</p>
        <div className="field-stack">
          <label className="field">
            <span>Type “{site.doc.business.name}” to confirm</span>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </label>
        </div>
        <div className="field-actions">
          <button className="btn btn--danger" type="submit" disabled={confirm !== site.doc.business.name}>Delete the site</button>
        </div>
        <p className="help help--error" role="alert">{gone ?? ""}</p>
      </form>
    </div>
  );
}

// What every site shares: the chat apps, email, help, the maker, the password.
export function BuilderSettings({ state, onState, passwordRequired, version, part }: { state: State; onState: (s: State) => void; passwordRequired: boolean; version?: string; part?: string }) {
  const [mailTo, setMailTo] = useState(state.email.to);
  const [statsUrl, setStatsUrl] = useState(state.analytics_url);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  useEffect(() => {
    api<Recipe[]>("/api/recipes").then(setRecipes, () => {});
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
  const mail = `mailto:contact@dozokit.com?subject=${encodeURIComponent("Dozokit Sites: an idea or a question")}&body=${encodeURIComponent(`Version ${version ?? "?"}\n\nWhat I wanted to do:\n\nWhat happened:\n`)}`;

  return (
    <div className="settings-grid">
      <nav className="settings-nav" aria-label="Settings">
        <a href="#settings/connections" onClick={jump("connections")}>Connections</a>
        <a href="#settings/help" onClick={jump("help")}>Help</a>
        <a href="#settings/account" onClick={jump("account")}>Account</a>
      </nav>
    <div className="settings">
      <h2 className="group-h" id="connections">Connections</h2>
      <section className="page-section">
        <h2>Claude and other chat apps</h2>
        <p className="lead">Claude (or ChatGPT) builds and changes your sites on your own plan, through the Dozokit Sites connector.</p>
        <details className="qa" open={state.chat_apps.length === 0}>
          <summary>How to connect Claude</summary>
          <ConnectSteps />
        </details>
        {state.chat_apps.length > 0 && (
          <ul className="checks">
            {state.chat_apps.map((c) => (
              <li key={c.id} className="ok">
                {c.name} <span className="help">connected {when(c.created_at)} · {c.last_used ? `last used ${ago(c.last_used)}` : "not used yet"}</span>{" "}
                <button type="button" className="link-btn" onClick={async () => onState(await api<State>(`/api/chat-apps/${c.id}`, { method: "DELETE" }))}>
                  Disconnect
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="page-section">
        <h2>Messages by email</h2>
        <p className="lead">
          {state.email.connected
            ? "Resend is connected: each message from any of your sites' contact forms also arrives in your mailbox."
            : "Only for sites with a contact form. Get each message in your mailbox through your own free Resend account: type the email of that account, then connect it."}
        </p>
        <form
          className="field-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await put({ notify_to: mailTo });
              if (!state.email.connected) location.assign((await api<{ url: string }>("/api/resend/start", { method: "POST" })).url);
              else setTest({ ok: true, text: "Saved." });
            } catch (err) {
              setTest({ ok: false, text: (err as Error).message });
            }
          }}
        >
          <label className="field">
            <span>Your email (the one you use, or will use, on resend.com)</span>
            <input type="email" required value={mailTo} onChange={(e) => setMailTo(e.target.value)} placeholder="you@example.com" />
          </label>
          <div className="field-actions">
            <button className="btn btn--ink" type="submit">{state.email.connected ? "Save" : "Connect Resend"}</button>
            {state.email.connected && (
              <>
                <button
                  type="button"
                  className="btn btn--quiet"
                  onClick={async () => {
                    try {
                      onState(await api<State>("/api/email/test", { method: "POST" }));
                      setTest({ ok: true, text: `Sent. Check ${state.email.to}.` });
                    } catch (err) {
                      setTest({ ok: false, text: (err as Error).message });
                    }
                  }}
                >
                  Send a test
                </button>
                <button type="button" className="link-btn" onClick={async () => onState(await api<State>("/api/resend", { method: "DELETE" }))}>
                  Disconnect
                </button>
              </>
            )}
          </div>
          <p className={test && !test.ok ? "help help--error" : "help"} role="status">
            {test?.text ?? (state.email.last && state.email.last !== "200" ? "The last email didn't go through: send a test to see why." : state.email.connected ? "" : "Resend opens: sign up with that same email if you don't have an account, then click Allow.")}
          </p>
        </form>
      </section>

      <Form
        title="Visitors"
        help="Your Dozokit Analytics address, the same for all your sites. Each site's own id goes in its Settings."
        onSave={async () => put({ analytics_url: statsUrl })}
      >
        <label className="field">
          <span>Dozokit Analytics address</span>
          <input value={statsUrl} onChange={(e) => setStatsUrl(e.target.value)} placeholder="https://dozokit-analytics.your-name.workers.dev" spellCheck={false} />
        </label>
      </Form>

      <h2 className="group-h" id="help">Help</h2>
      <section className="page-section">
        <h2>Step by step</h2>
        {recipes.map((r) => (
          <details key={r.id} className="qa" id={r.id}>
            <summary>{r.title}</summary>
            <Markdown text={r.body} />
          </details>
        ))}
      </section>

      <section className="page-section">
        <h2>Talk to the maker</h2>
        <p className="lead">Missing something, stuck, or an idea? Write to Ludo, who builds Dozokit Sites. You get an answer by email, and the most asked things become ready-made answers in the next version.</p>
        <a className="btn btn--card" href={mail}>Write to Ludo</a>
      </section>

      <h2 className="group-h" id="account">Account</h2>
      {passwordRequired && (
        <section className="page-section">
          <ChangePassword />
        </section>
      )}

      <section className="page-section">
        <h2>Updates</h2>
        <TurnOnUpdates />
      </section>

      <section className="page-section">
        <h2>Version</h2>
        <p className="help">Dozokit Sites {version}.</p>
        <button
          type="button"
          className="btn btn--quiet"
          onClick={async () => {
            await api("/api/logout", { method: "POST" });
            location.reload();
          }}
        >
          Sign out
        </button>
      </section>
    </div>
    </div>
  );
}
