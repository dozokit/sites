import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./lib/api";
import { t } from "./lib/i18n";
import { returned } from "./lib/connect";
import type { SiteDetail, State } from "./lib/types";
import { Editor } from "./pages/Editor";
import { Home } from "./pages/Home";
import { Login, Setup } from "./pages/Login";
import { Messages } from "./pages/Messages";
import { Photos } from "./pages/Photos";
import { Address } from "./pages/Address";
import { BuilderSettings, SiteSettings } from "./pages/Settings";
import { Start } from "./pages/Start";

// setupNeeded: deployed without a usable PASSWORD, so the builder stays shut until one is set.
type Auth = { signedIn: boolean; passwordRequired: boolean; setupNeeded: string | null };
type Tab = "site" | "photos" | "address" | "messages" | "settings";
type View = { kind: "home" } | { kind: "new" } | { kind: "settings"; part?: string } | { kind: "site"; id: number; tab: Tab };
const PARTS = ["connections", "usage", "help", "account", "updates"];

// The address keeps the place: #new, #settings, #site/3, #site/3/messages.
const read = (): View => {
  const h = location.hash.slice(1).split("/");
  if (h[0] === "new") return { kind: "new" };
  // #settings/help opens Settings at that group; a bare #help (older links) does too.
  if (h[0] === "settings") return { kind: "settings", part: PARTS.includes(h[1]) ? h[1] : undefined };
  if (PARTS.includes(h[0])) return { kind: "settings", part: h[0] };
  if (h[0] === "site" && Number(h[1])) return { kind: "site", id: Number(h[1]), tab: (["photos", "address", "messages", "settings"].includes(h[2]) ? h[2] : "site") as Tab };
  return { kind: "home" };
};
const write = (v: View) => history.replaceState(null, "", v.kind === "home" ? location.pathname : v.kind === "site" ? `#site/${v.id}${v.tab === "site" ? "" : `/${v.tab}`}` : v.kind === "settings" && v.part ? `#settings/${v.part}` : `#${v.kind}`);

export function App() {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [site, setSite] = useState<SiteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [release, setRelease] = useState<{ version: string; latest: string | null } | null>(null);
  const [view, setView] = useState<View>(read);
  const menu = useRef<HTMLDetailsElement>(null);

  const go = (v: View) => {
    setView(v);
    write(v);
    setError(null);
  };

  const load = useCallback(async () => {
    try {
      const a = await api<Auth>("/api/me");
      setAuth(a);
      if (!a.signedIn) return;
      // Sent here by a chat app's "Connect" page to sign in first: back to it.
      const next = new URLSearchParams(location.search).get("next");
      if (next?.startsWith("/oauth/authorize?")) return location.assign(next);
      // Back from Resend's Connect page (email).
      const back = returned();
      if (back) {
        go({ kind: "settings" });
        setState(await api<State>("/api/resend/connect", { method: "POST", body: JSON.stringify(back) }).catch(async (e) => (setError((e as Error).message), api<State>("/api/state"))));
      } else setState(await api<State>("/api/state"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
    const out = () => setAuth((a) => (a ? { ...a, signedIn: false } : a));
    window.addEventListener("dozokit:signed-out", out);
    return () => window.removeEventListener("dozokit:signed-out", out);
  }, [load]);
  useEffect(() => {
    if (auth?.signedIn) api<typeof release>("/api/version").then(setRelease, () => {});
  }, [auth?.signedIn]);
  // Back, forward, or an address typed by hand: the page follows it.
  useEffect(() => {
    const on = () => setView(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  // A click anywhere else closes the menu.
  useEffect(() => {
    const out = (e: MouseEvent) => menu.current?.open && !menu.current.contains(e.target as Node) && (menu.current.open = false);
    document.addEventListener("click", out);
    return () => document.removeEventListener("click", out);
  }, []);
  // The open site: loaded when its page opens.
  const openId = view.kind === "site" ? view.id : null;
  useEffect(() => {
    setSite(null);
    if (openId) api<SiteDetail>(`/api/sites/${openId}`).then(setSite, (e: Error) => (setError(e.message), go({ kind: "home" })));
  }, [openId]);

  if (error && !auth) return <main className="container main"><p className="help help--error">{error}</p></main>;
  if (!auth) return <main className="container main" aria-busy="true" />;
  if (auth.setupNeeded) return <Setup message={auth.setupNeeded} />;
  if (!auth.signedIn) return <Login onDone={load} />;
  if (!state) return <main className="container main">{error ? <p className="help help--error">{error}</p> : <p className="help">{t("Loading…")}</p>}</main>;

  const first = state.sites.length === 0;
  const start = (
    <main className="container main">
      <Start state={state} onState={setState} onCancel={first ? undefined : () => go({ kind: "home" })} onMade={(id) => go({ kind: "site", id, tab: "site" })} />
    </main>
  );
  if (first) return start;

  const onSite = (s: SiteDetail & { builder?: State }) => {
    setSite(s);
    if (s.builder) setState(s.builder);
  };
  const tab = (t: Tab, label: string) =>
    view.kind === "site" && (
      <a href={`#site/${view.id}/${t}`} className="nav-link" aria-current={view.tab === t ? "page" : undefined} onClick={(e) => (e.preventDefault(), go({ ...view, tab: t }))}>
        {label}
      </a>
    );

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner container">
          <a href="/admin" className="wordmark" onClick={(e) => (e.preventDefault(), go({ kind: "home" }))}>
            <img src="/icon.svg" alt="" width="20" height="20" />
            {t("Your sites")}
          </a>
          <nav className="nav" aria-label={t("Sections")}>
            {view.kind === "site" && site && (
              <>
                <span className="nav-site">{site.doc.business.name}</span>
                {tab("site", t("Edit"))}
                {tab("photos", t("Photos"))}
                {tab("address", t("Address"))}
                {tab("messages", site.unread ? t("Messages ({n})", { n: site.unread }) : t("Messages"))}
                {tab("settings", t("Site settings"))}
              </>
            )}
          </nav>
          <span className="topbar-end">
            {view.kind === "site" && site?.published && (
              <a className="nav-link" href={site.address + "/"} target="_blank" rel="noopener">
                {t("Open the site")} ↗
              </a>
            )}
            {/* The settings every site shares, the same menu on every screen. */}
            <details className="menu" ref={menu}>
              <summary className="nav-link" aria-current={view.kind === "settings" ? "page" : undefined}>
                {t("Settings")} ▾
              </summary>
              <div className="menu-list">
                {(["connections", "usage", "help", "account", "updates"] as const).map((p) => (
                  <a key={p} href={`#settings/${p}`} onClick={(e) => (e.preventDefault(), (menu.current!.open = false), go({ kind: "settings", part: p }))}>
                    {t({ connections: "Connections", usage: "Usage", help: "Help", account: "Account", updates: "Updates" }[p])}
                  </a>
                ))}
                <button
                  type="button"
                  onClick={async () => {
                    await api("/api/logout", { method: "POST" });
                    location.reload();
                  }}
                >
                  {t("Sign out")}
                </button>
              </div>
            </details>
          </span>
        </div>
      </header>
      {release?.latest && (
        <p className="update container">
          {t("Version {v} is available.", { v: release.latest })}{" "}
          <a href="#settings/updates" onClick={(e) => (e.preventDefault(), go({ kind: "settings", part: "updates" }))}>
            {t("How to update")}
          </a>
        </p>
      )}
      {error && <p className="toast help--error" role="alert">{error}</p>}
      {view.kind === "home" && <main className="container main"><Home state={state} onOpen={(id) => go({ kind: "site", id, tab: "site" })} onNew={() => go({ kind: "new" })} /></main>}
      {view.kind === "new" && start}
      {view.kind === "settings" && <main className="container main"><BuilderSettings state={state} onState={setState} passwordRequired={auth.passwordRequired} version={release?.version} part={view.part} /></main>}
      {view.kind === "site" && !site && <main className="container main"><p className="help">{t("Loading…")}</p></main>}
      {view.kind === "site" && site && (
        <>
          {view.tab === "site" && <Editor key={site.id} site={site} builder={state} onSite={onSite} />}
          {view.tab === "photos" && <main className="container main"><Photos siteId={site.id} /></main>}
          {view.tab === "address" && <main className="container main"><Address site={site} onSite={onSite} /></main>}
          {view.tab === "messages" && <main className="container main"><Messages site={site} onSite={onSite} /></main>}
          {view.tab === "settings" && <main className="container main"><SiteSettings site={site} builder={state} onSite={onSite} onDeleted={(s) => (setState(s), go({ kind: "home" }))} /></main>}
        </>
      )}
    </div>
  );
}
