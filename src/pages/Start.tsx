import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { State } from "../lib/types";

// "3 minutes ago", "yesterday", in the owner's language.
export function ago(t: number) {
  const m = Math.round((t - Date.now()) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (m > -60) return rtf.format(m, "minute");
  if (m > -1440) return rtf.format(Math.round(m / 60), "hour");
  return rtf.format(Math.round(m / 1440), "day");
}

// A prompt to paste into Claude, always shown, with a copy button inside it.
export function PromptBox({ text, label = "Prompt for Claude" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="prompt">
      <pre aria-label={label}>{text}</pre>
      <button
        type="button"
        className={`copy${copied ? " is-done" : ""}`}
        aria-label={copied ? "Copied" : "Copy"}
        title={copied ? "Copied" : "Copy"}
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {copied ? <path d="M5 12l5 5 9-10" /> : <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>}
        </svg>
      </button>
    </div>
  );
}

// A new site is made in Claude (or ChatGPT): connect it once, then paste a first message there.
// This page watches for the new site and opens it in the editor when Claude has made it.
export function Start({ state, onState, onMade, onCancel }: { state: State; onState: (s: State) => void; onMade: (id: number) => void; onCancel?: () => void }) {
  const [url, setUrl] = useState("");
  const [about, setAbout] = useState("");
  // Connected means used in the last 30 days: a connector removed in Claude stops calling.
  const using = state.chat_apps.filter((a) => a.last_used && Date.now() - a.last_used < 30 * 86_400_000);
  const connected = using.length > 0;
  const known = state.sites.map((s) => s.id).join();

  useEffect(() => {
    const t = setInterval(async () => {
      const s = await api<State>("/api/state").catch(() => null);
      if (!s) return;
      const added = s.sites.find((x) => !known.split(",").includes(String(x.id)));
      if (added) return onMade(added.id), onState(s);
      if (JSON.stringify(s.chat_apps) !== JSON.stringify(state.chat_apps)) onState(s);
    }, 4000);
    return () => clearInterval(t);
  }, [known, JSON.stringify(state.chat_apps)]);

  const prompt = [
    "Use Dozokit Sites to build a website for my business.",
    url.trim() && `My current website: ${url.trim()}`,
    about.trim(),
  ].filter(Boolean).join("\n");

  return (
    <section className="first stock">
      <h1>{state.sites.length ? "A new site" : "Make your site with Claude"}</h1>
      <p>Claude designs and writes your site, using your own Claude plan. You then change any text or photo here yourself, for free, and publish when you like.</p>

      <h2 className="first-step">1. Connect Claude to this builder{connected && <span className="done"> · done</span>}</h2>
      {connected ? (
        <p className="help">{using.map((a) => a.name).join(", ")} used your builder {ago(Math.max(...using.map((a) => a.last_used!)))}.</p>
      ) : (
        <>
          <ol className="first-steps">
            <li>In Claude, open <strong>Settings → Connectors</strong> and click <strong>Add custom connector</strong>.</li>
            <li>Name it <strong>Dozokit Sites</strong> and paste this address:</li>
          </ol>
          <PromptBox text={`${location.origin}/mcp`} label="Connector address" />
          <p className="help">Claude then opens a page here to ask your permission: click Allow. ChatGPT works the same way, in its connector settings.</p>
        </>
      )}

      <h2 className="first-step">2. Paste this in a new Claude chat</h2>
      <label className="field">
        <span>Your current website, if you have one</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="martin-plomberie.fr" inputMode="url" spellCheck={false} />
      </label>
      <label className="field">
        <span>Anything Claude should know (optional)</span>
        <textarea rows={3} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="Turkish restaurant in Pau, wood-fired grill. I want people to book a table." />
      </label>
      <PromptBox text={prompt} />
      <p className="help" role="status">Claude proposes a design first and asks only what it can't find. Your new site opens here by itself once Claude has made it.</p>
      {onCancel && (
        <button className="btn btn--quiet" type="button" onClick={onCancel}>
          Back to your sites
        </button>
      )}
    </section>
  );
}
