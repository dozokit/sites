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

// A small copy button, ticked for a moment once it has copied.
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`copy${copied ? " is-done" : ""}`}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
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
  );
}

// A prompt to paste into Claude, always shown, with the copy button inside it.
export function PromptBox({ text, label = "Prompt for Claude" }: { text: string; label?: string }) {
  return (
    <div className="prompt">
      <pre aria-label={label}>{text}</pre>
      <CopyButton text={text} />
    </div>
  );
}

// An address on one line, as a link, with a copy button beside it.
export function AddressLine({ url, href = url }: { url: string; href?: string }) {
  return (
    <p className="address-line">
      <a href={href} target="_blank" rel="noopener">
        {url.replace(/^https?:\/\//, "")}
      </a>
      <CopyButton text={url} label="Copy the address" />
    </p>
  );
}

// How to connect Claude (or ChatGPT) to this builder, with its own address to paste.
export function ConnectSteps() {
  return (
    <>
      <ol className="first-steps">
        <li>
          In Claude (the app or claude.ai), open <strong>Customize → Connectors</strong>, click <strong>+ Add</strong>, then <strong>Add custom connector</strong>.
        </li>
        <li>
          Name it <strong>Dozokit Sites</strong> and paste this address:
          <AddressLine url={`${location.origin}/mcp`} />
        </li>
        <li>
          Claude opens a Dozokit Sites page to ask your permission: sign in if asked, then click <strong>Allow</strong>.
        </li>
        <li>In a new Claude chat, ask it to build or change your site. It can now use Dozokit Sites.</li>
      </ol>
      <p className="help">ChatGPT works the same way, as a custom connector in its settings. To disconnect an app, use Settings → Connections here.</p>
    </>
  );
}

// Who has used the builder in the last 30 days: a connector removed in Claude stops calling.
export const recent = (s: State) => s.chat_apps.filter((a) => a.last_used && Date.now() - a.last_used < 30 * 86_400_000);

// A new site is made in Claude (or ChatGPT): connect it once, then paste a first message there.
// This page watches for the new site and opens it in the editor when Claude has made it.
export function Start({ state, onState, onMade, onCancel }: { state: State; onState: (s: State) => void; onMade: (id: number) => void; onCancel?: () => void }) {
  const [url, setUrl] = useState("");
  const [about, setAbout] = useState("");
  const using = recent(state);
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

      <h2 className="first-step">1. Connect Claude to Dozokit Sites{connected && <span className="done"> · done</span>}</h2>
      {connected ? (
        <p className="help">{using.map((a) => a.name).join(", ")} used Dozokit Sites {ago(Math.max(...using.map((a) => a.last_used!)))}.</p>
      ) : (
        <ConnectSteps />
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
