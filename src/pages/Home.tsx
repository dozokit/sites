import { lang, t } from "../lib/i18n";
import type { State } from "../lib/types";

// Every site in this builder, newest change first, with what waits on the owner.
export function Home({ state, onOpen, onNew }: { state: State; onOpen: (id: number) => void; onNew: () => void }) {
  const list = [...state.sites].sort((a, b) => b.updated_at - a.updated_at);
  return (
    <section className="page-section">
      <div className="home-head">
        <h2>{t("Your sites")}</h2>
        <button className="btn btn--ink" type="button" onClick={onNew}>
          {t("New site")}
        </button>
      </div>
      <p className="lead">
        {t(list.length === 1 ? "{n} site." : "{n} sites.", { n: list.length })}
      </p>
      <ul className="sites">
        {list.map((s) => (
          <li key={s.id}>
            <button type="button" className="site-card stock" onClick={() => onOpen(s.id)}>
              <span className="site-name">{s.name}</span>
              <span className="site-addr">{s.address.replace(/^https?:\/\//, "")}</span>
              <span className="site-meta">
                <span className={`tag${s.published === s.draft ? "" : " tag--todo"}`}>{!s.published ? t("Not published") : s.published === s.draft ? t("Live") : t("Changes not published")}</span>
                {s.unread > 0 && <span className="tag tag--todo">{t(s.unread === 1 ? "{n} new message" : "{n} new messages", { n: s.unread })}</span>}
                <span className="muted">
                  {t("Changed {date}", { date: new Date(s.updated_at).toLocaleDateString(lang) })}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
