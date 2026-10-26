import { useState } from "react";
import { t } from "../lib/i18n";
import { uploadPhoto } from "../lib/photos";
import type { SiteDetail } from "../lib/types";
import { PhotoPicker } from "./Photos";

type Save = (path: string, value: string, note: string) => Promise<void>;

// The few details that live in more than one place on the page, edited once: the phone and email
// (every button and block that shows them), the logo and the favicon, and the Google Maps link.
// Everything else is changed on the page itself, or by Claude.
export function Details({ site, save, onClose, message }: { site: SiteDetail; save: Save; onClose: () => void; message: { ok: boolean; text: string } | null }) {
  const b = site.doc.business as { phone?: string; email?: string; logo?: string; favicon?: string; google_url?: string; name: string };
  const [phone, setPhone] = useState(b.phone ?? "");
  const [email, setEmail] = useState(b.email ?? "");
  const [google, setGoogle] = useState(b.google_url ?? "");
  const [choosing, setChoosing] = useState<"logo" | "favicon" | null>(null);

  const image = (key: "logo" | "favicon", label: string, empty: string) => (
    <div className="detail-image">
      <span className={`detail-thumb detail-thumb--${key}`}>{b[key] ? <img src={`/img/${encodeURIComponent(b[key]!)}`} alt="" /> : <em>{empty}</em>}</span>
      <div className="pop-actions">
        <button className="btn btn--quiet" type="button" onClick={() => setChoosing(key)}>
          {t("Choose from your photos")}
        </button>
        <label className="btn btn--quiet">
          {t("Upload a new one")}
          <input type="file" accept="image/*" hidden onChange={async (e) => e.target.files?.[0] && save(`business.${key}`, (await uploadPhoto(site.id, e.target.files[0])).id, t(label))} />
        </label>
        {b[key] && (
          <button className="link-btn" type="button" onClick={() => save(`business.${key}`, "", t(label))}>
            {key === "favicon" ? t("Use the generated one") : t("Remove")}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <aside className="chat" aria-label={t("Site details")}>
      <h2 className="chat-h">{t("Site details")}</h2>
      <p className="muted">{t("Edited once, changed everywhere on your site. Saved as a draft: visitors see it once you publish, except the Google Maps link, which goes online at once.")}</p>

      <form
        className="field-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (phone !== (b.phone ?? "")) await save("business.phone", phone, t("Phone number changed"));
          if (email !== (b.email ?? "")) await save("business.email", email, t("Email changed"));
        }}
      >
        <h3 className="detail-h">{t("Contact")}</h3>
        <label className="field">
          <span>{t("Phone")}</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="05 59 80 27 00" />
        </label>
        <label className="field">
          <span>{t("Email")}</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder={t("you@example.com")} />
        </label>
        <p className="help">{t("A new number or email replaces the old one in every button, link and block of the page.")}</p>
        <button className="btn btn--ink" type="submit" disabled={phone === (b.phone ?? "") && email === (b.email ?? "")}>
          {t("Save · free")}
        </button>
      </form>

      <h3 className="detail-h">{t("Logo")}</h3>
      {image("logo", "Logo changed", t("No logo: your name shows instead"))}

      <h3 className="detail-h">{t("Favicon")}</h3>
      <p className="help">{t("The little icon in the browser tab and in Google's results.")}</p>
      {image("favicon", "Favicon changed", [...b.name.trim()][0]?.toUpperCase() ?? "•")}

      <form
        className="field-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          await save("business.google_url", google.trim(), t("Google Maps link"));
        }}
      >
        <h3 className="detail-h">{t("Google Maps")}</h3>
        <label className="field">
          <span>{t("Google Maps link")}</span>
          <input value={google} onChange={(e) => setGoogle(e.target.value)} placeholder="https://maps.app.goo.gl/…" spellCheck={false} />
        </label>
        <button className="btn btn--ink" type="submit" disabled={google.trim() === (b.google_url ?? "")}>
          {t("Save and put online")}
        </button>
      </form>

      <p className={message && !message.ok ? "help help--error" : "help"} role="status">
        {message?.text ?? ""}
      </p>
      <p className="help">
        {t("Your address:")} <strong>{site.address.replace(/^https?:\/\//, "")}</strong> ·{" "}
        <a href={`#site/${site.id}/address`}>{t("Use your own domain")}</a>
      </p>
      <button className="btn btn--quiet" type="button" onClick={onClose}>
        {t("Close")}
      </button>

      {choosing && (
        <PhotoPicker
          siteId={site.id}
          onClose={() => setChoosing(null)}
          onPick={(id) => {
            const key = choosing;
            setChoosing(null);
            save(`business.${key}`, id, t(key === "logo" ? "Logo changed" : "Favicon changed"));
          }}
        />
      )}
    </aside>
  );
}
