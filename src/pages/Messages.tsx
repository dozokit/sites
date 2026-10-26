import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { lang, t } from "../lib/i18n";
import type { SiteDetail } from "../lib/types";

type Message = { id: number; name: string; email: string; phone: string | null; body: string; read: number; created_at: number };

export function Messages({ site, onSite }: { site: SiteDetail; onSite: (s: SiteDetail) => void }) {
  const [list, setList] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Message[]>(`/api/sites/${site.id}/messages`).then((l) => {
      setList(l);
      if (l.some((m) => !m.read)) api<SiteDetail>(`/api/sites/${site.id}/read`, { method: "POST" }).then(onSite, () => {});
    }, (e: Error) => setError(e.message));
  }, []);
  if (!list) return <p className={error ? "help help--error" : "help"}>{error ?? t("Loading…")}</p>;
  return (
    <section className="page-section">
      <h2>{t("Messages from your contact form")}</h2>
      {!list.length && <p className="muted">{t("No message yet. Your site has no contact form unless you ask for one: ask Claude “add a contact form to my site”. Messages sent through it appear here.")}</p>}
      <ul className="messages">
        {list.map((m) => (
          <li key={m.id} className={m.read ? "" : "unread"}>
            <p className="msg-head">
              <strong>{m.name}</strong> · <a href={`mailto:${m.email}`}>{m.email}</a>
              {m.phone && <> · <a href={`tel:${m.phone}`}>{m.phone}</a></>} · <span className="muted">{new Date(m.created_at).toLocaleString(lang)}</span>
            </p>
            <p className="msg-body">{m.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
