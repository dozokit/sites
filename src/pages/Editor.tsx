import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { SiteDetail, State } from "../lib/types";
import { StylePicker, type Style } from "./Style";
import { PhotoPicker } from "./Photos";
import { ConnectSteps, PromptBox, recent } from "./Start";
import { History } from "./Settings";
import { uploadPhoto } from "../lib/photos";

// One pick in the preview, at the level the owner chose in its trail (see public/editor.js).
type Pick = { trail: string[]; i: number; path: string | null; kind: "text" | "image" | "html" | null; section: string | null; selector: string | null; text: string; href: string | null; photos: string[]; rect: { x: number; y: number; w: number; h: number } };
type After = SiteDetail & { builder?: State };

// What Claude needs to find each picked element: where it is in the site, its words, its photos.
function prompt(detail: SiteDetail, lang: string, picks: Pick[], ask: string) {
  const lines = [`In my Dozokit site ${detail.id} (${detail.doc.business.name}), ${lang.toUpperCase()} version:`];
  for (const p of picks) {
    const where = [p.path ?? p.section, p.selector].filter(Boolean).join("; ");
    const text = p.kind === "image" ? "" : p.text.slice(0, 120);
    lines.push(`- ${p.trail.slice(0, p.i + 1).join(" › ")}${where ? ` (${where})` : ""}${text ? `: "${text}"` : ""}${p.photos.length ? ` [photos: ${p.photos.join(", ")}]` : ""}`);
  }
  if (!picks.length) lines.push("- (click something on the page to point at it)");
  lines.push("", ask.trim() || "(say what should change)");
  return lines.join("\n");
}

export function Editor({ site: detail, builder, onSite }: { site: SiteDetail; builder: State; onSite: (a: After) => void }) {
  const site = detail.doc;
  const at = `/api/sites/${detail.id}`;
  const [lang, setLang] = useState(site.langs[0]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [current, setCurrent] = useState(-1);
  const [draftText, setDraftText] = useState("");
  const [ask, setAsk] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<Pick | null>(null);
  const [history, setHistory] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);
  const [publishing, setPublishing] = useState<null | { checks: { ok: boolean; label: string; fix?: string }[]; url?: string; open: boolean }>(null);
  const [styling, setStyling] = useState<Style | null>(null);
  const [choosing, setChoosing] = useState<string | null>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const picked = picks[current] ?? null;
  const tell = (m: object) => iframe.current?.contentWindow?.postMessage(m, location.origin);
  // The preview reloads after each change: it's told again whether picking is on.
  useEffect(() => {
    tell({ type: "mode", on: picking });
  }, [picking]);

  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== iframe.current?.contentWindow) return;
      if (e.data?.type === "stop") return setPicking(false);
      if (e.data?.type === "edit") {
        const it = e.data.item as Pick;
        setEditing((was) => {
          if (was?.path !== it.path) setDraftText(it.kind === "text" ? it.text : "");
          return it;
        });
        return setError(null);
      }
      if (e.data?.type !== "picks") return;
      const next = e.data.items as Pick[];
      setPicks(next);
      setCurrent(e.data.current);
      setError(null);
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, []);

  // After any change the preview reloads, and what was picked goes with it.
  const done = (s: After, note?: string) => {
    onSite(s);
    setFrame((f) => f + 1);
    setPicks([]);
    setCurrent(-1);
    setEditing(null);
    setBusy(null);
    if (note) setSaved(note);
  };
  const fail = (err: unknown) => {
    setError((err as Error).message);
    setBusy(null);
  };

  async function saveText(path: string, value: string, note: string) {
    setBusy("Saving");
    try {
      done(await api<After>(`${at}/text`, { method: "PUT", body: JSON.stringify({ path, value, note }) }), note);
    } catch (err) {
      fail(err);
    }
  }

  async function photo(path: string, file: File) {
    setBusy("Adding the photo");
    try {
      await saveText(path, (await uploadPhoto(detail.id, file)).id, "Photo changed by you");
    } catch (err) {
      fail(err);
    }
  }

  async function undo() {
    setBusy("Undoing");
    try {
      done(await api<After>(`${at}/undo`, { method: "POST" }), "Undone");
    } catch (err) {
      fail(err);
    }
  }

  // Publishing never waits on the checks: the first time they're shown as suggestions next to
  // the button, after that the site goes live at once and the suggestions stay one click away.
  async function publish(confirm: boolean) {
    setBusy(confirm ? "Publishing" : "Checking");
    try {
      const out = await api<After & { checks: { ok: boolean; label: string; fix?: string }[]; url?: string }>(`${at}/publish`, { method: "POST", body: JSON.stringify({ confirm }) });
      if (confirm) onSite(out);
      setPublishing({ checks: out.checks, url: out.url, open: !confirm });
      setBusy(null);
    } catch (err) {
      fail(err);
    }
  }

  const changed = detail.draft !== detail.published;
  // The popover sits under what was picked, inside the preview's box.
  const box = iframe.current?.getBoundingClientRect();
  const near = editing ?? picked;
  const pop = near && box ? { left: Math.max(8, Math.min(box.left + near.rect.x, innerWidth - 360)), top: box.top + scrollY + near.rect.y + near.rect.h + 8 } : null;
  const unedit = () => (setEditing(null), tell({ type: "unedit" }));

  return (
    <div className="editor">
      <div className="editor-bar">
        {site.langs.length > 1 && (
          <div className="seg" role="group" aria-label="Language shown">
            {site.langs.map((l) => (
              <button key={l} type="button" aria-pressed={l === lang} onClick={() => (setLang(l), setPicks([]), setCurrent(-1))}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        )}
        <button className="btn btn--quiet" type="button" onClick={undo} disabled={Boolean(busy)}>
          Undo
        </button>
        <button className="btn btn--quiet" type="button" aria-pressed={history} onClick={() => setHistory(!history)}>
          History
        </button>
        <button className="btn btn--quiet" type="button" onClick={() => setStyling({ layout: String((site.theme as { layout?: string }).layout ?? "storefront"), palette: (site.theme as { palette: Style["palette"] }).palette })} disabled={Boolean(busy)}>
          Style
        </button>
        <span className="editor-status" role="status">
          {busy ? `${busy}…` : changed ? (detail.published ? "Changes not published yet" : "Not published yet") : "Published"}
        </span>
        <button className="btn btn--ink" type="button" onClick={() => publish(Boolean(detail.published))} disabled={Boolean(busy) || !changed}>
          Publish
        </button>
      </div>

      <div className="editor-main">
        <iframe ref={iframe} key={`${lang}-${frame}`} onLoad={() => tell({ type: "mode", on: picking })} className="preview" title="Your site, click anything to change it" src={`/admin/preview?site=${detail.id}&lang=${lang}`} />

        {history ? (
          <aside className="chat" aria-label="Every version">
            <h2 className="chat-h">Every version</h2>
            <p className="muted">Each change is kept. Go back to any of them; the newest stays in the list.</p>
            <History site={detail} onSite={(s) => done(s, "Back to an earlier version")} />
            <button className="btn btn--quiet" type="button" onClick={() => setHistory(false)}>
              Close
            </button>
          </aside>
        ) : (
        <aside className="chat" aria-label="Ask Claude">
          <p className="muted">
            <span className="dot dot--free" aria-hidden="true" /> Texts and photos outlined in green you change yourself, for free: just click them.
          </p>
          <p className="muted">
            <span className="dot dot--ask" aria-hidden="true" /> For anything else (the layout, a section, the colours), point at it for Claude: the prompt below fills itself, then paste it in your Claude chat.
          </p>
          <div className="chips">
            {picks.map((p, k) => (
              <span key={k} className={`chip${k === current ? " is-on" : ""}`}>
                <button type="button" className="chip-name" onClick={() => tell({ type: "current", k })}>
                  {p.trail[p.i]}
                </button>
                <button type="button" aria-label={`Remove ${p.trail[p.i]}`} onClick={() => tell({ type: "unpick", k })}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <button className={`btn btn--ask${picking ? " is-on" : ""}`} type="button" aria-pressed={picking} onClick={() => (picking && tell({ type: "clear" }), setEditing(null), setPicking(!picking))}>
            {picking ? "Done pointing" : "Point at something for Claude"}
          </button>
          <label className="field">
            <span>What should change?</span>
            <textarea rows={3} value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Make the mosaic one row on phones" />
          </label>
          <PromptBox text={prompt(detail, lang, picks, ask)} />
          {!recent(builder).length && (
            <details className="qa notice">
              <summary>Claude isn't connected to your builder yet</summary>
              <ConnectSteps />
            </details>
          )}
          <p className={error ? "help help--error" : "help"} role="alert">
            {error ?? saved ?? ""}
          </p>
        </aside>
        )}
      </div>

      {editing && pop && (
        <div className="pop pop--free stock" style={{ left: pop.left, top: pop.top }} role="dialog" aria-label="Change it yourself, free">
          {editing.kind === "text" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveText(editing.path!, draftText, `Changed “${editing.text.slice(0, 40)}”`);
              }}
            >
              <textarea autoFocus rows={Math.min(8, Math.ceil(draftText.length / 40) + 1)} value={draftText} onChange={(e) => setDraftText(e.target.value)} aria-label="Text" />
              <div className="pop-actions">
                <button className="btn btn--ink" type="submit" disabled={Boolean(busy) || draftText === editing.text}>
                  Save · free
                </button>
                <button className="btn btn--quiet" type="button" onClick={unedit}>
                  Cancel
                </button>
              </div>
            </form>
          )}
          {editing.kind === "image" && (
            <div className="pop-actions">
              <button className="btn btn--ink" type="button" onClick={() => (setChoosing(editing.path), unedit())}>
                Choose from your photos
              </button>
              <label className="btn btn--quiet">
                Upload a new one
                <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && photo(editing.path!, e.target.files[0])} />
              </label>
              <button className="btn btn--quiet" type="button" onClick={unedit}>
                Cancel
              </button>
            </div>
          )}
          {editing.href && (
            <a className="link-btn" href={editing.href} target="_blank" rel="noopener">
              Open link ↗
            </a>
          )}
        </div>
      )}

      {!editing && picked && pop && (
        <div className="pop pop--ask stock" style={{ left: pop.left, top: pop.top }} role="dialog" aria-label="What you picked for Claude">
          <nav className="trail" aria-label="Layers">
            {picked.trail.map((t, k) => (
              <span key={k}>
                {k > 0 && <span aria-hidden="true"> › </span>}
                <button type="button" aria-current={k === picked.i ? "true" : undefined} onClick={() => tell({ type: "level", i: k })}>
                  {t}
                </button>
              </span>
            ))}
          </nav>
          <p className="help">
            <kbd>↑</kbd> <kbd>↓</kbd> other layers · <kbd>Shift</kbd>+click to add more · say what to change on the right
          </p>
          {picked.href && (
            <a className="link-btn" href={picked.href} target="_blank" rel="noopener">
              Open link ↗
            </a>
          )}
        </div>
      )}

      {choosing && (
        <PhotoPicker
          siteId={detail.id}
          onClose={() => setChoosing(null)}
          onPick={(id) => {
            const path = choosing;
            setChoosing(null);
            saveText(path, id, "Photo changed by you");
          }}
        />
      )}

      {styling && (
        <div className="modal-back" onClick={() => setStyling(null)}>
          <section className="modal modal--wide stock" role="dialog" aria-modal="true" aria-labelledby="style-h" onClick={(e) => e.stopPropagation()}>
            <h2 id="style-h">Style</h2>
            <StylePicker value={styling} onChange={setStyling} />
            <div className="pop-actions">
              <button
                className="btn btn--ink"
                type="button"
                disabled={Boolean(busy)}
                onClick={async () => {
                  setBusy("Changing the style");
                  try {
                    const out = await api<After>(`${at}/style`, { method: "PUT", body: JSON.stringify({ style: styling }) });
                    setStyling(null);
                    done(out, "Style changed");
                  } catch (err) {
                    fail(err);
                  }
                }}
              >
                Use this style · free
              </button>
              <button className="btn btn--quiet" type="button" aria-pressed={history} onClick={() => setHistory(!history)}>
          History
        </button>
        <button className="btn btn--quiet" type="button" onClick={() => setStyling(null)}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}

      {publishing && !publishing.open && publishing.url && (
        <p className="toast" role="status">
          Published.{" "}
          {publishing.checks.some((c) => !c.ok) && (
            <button type="button" className="link-btn" onClick={() => setPublishing({ ...publishing, open: true })}>
              {publishing.checks.filter((c) => !c.ok).length} suggestions to help Google find you
            </button>
          )}{" "}
          <button type="button" className="link-btn" onClick={() => setPublishing(null)}>
            Close
          </button>
        </p>
      )}

      {publishing?.open && (
        <div className="modal-back" onClick={() => setPublishing(null)}>
          <section className="modal stock" role="dialog" aria-modal="true" aria-labelledby="pub-h" onClick={(e) => e.stopPropagation()}>
            <h2 id="pub-h">{publishing.url ? "Your site is live" : "Ready to publish"}</h2>
            {publishing.url ? (
              <p>
                <a href={publishing.url} target="_blank" rel="noopener">
                  {publishing.url}
                </a>
              </p>
            ) : (
              <div className="pop-actions">
                <button className="btn btn--ink" type="button" onClick={() => publish(true)} disabled={Boolean(busy)}>
                  Publish now
                </button>
              </div>
            )}
            {publishing.checks.some((c) => !c.ok) && (
              <>
                <h3 className="suggest-h">Suggestions (optional)</h3>
                <p className="help">These help Google and AI assistants find you. Do them whenever you like.</p>
                <ul className="checks">
                  {publishing.checks.filter((c) => !c.ok).map((c) => (
                    <li key={c.label} className="todo">
                      <span aria-hidden="true">○</span> {c.label}
                      <span className="help"> {c.fix}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <details className="passed">
              <summary>✓ {publishing.checks.filter((c) => c.ok).length} of {publishing.checks.length} checks passed</summary>
              <ul className="checks">{publishing.checks.filter((c) => c.ok).map((c) => <li key={c.label} className="ok">✓ {c.label}</li>)}</ul>
            </details>
            <div className="pop-actions">
              <button className="btn btn--quiet" type="button" onClick={() => setPublishing(null)}>
                Close
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
