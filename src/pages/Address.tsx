import { useState } from "react";
import { api } from "../lib/api";
import { rich, t } from "../lib/i18n";
import type { SiteDetail } from "../lib/types";
import { Form } from "./Settings";
import { AddressLine, PromptBox } from "./Start";

const WORKERS = "https://dash.cloudflare.com/?to=/:account/workers-and-pages";
const ONBOARD = "https://dash.cloudflare.com/?to=/:account/domains/overview";

type Have = "none" | "elsewhere" | "cloudflare";
const HAVE: [Have, string][] = [
  ["none", "No, I need one"],
  ["elsewhere", "Yes, bought elsewhere"],
  ["cloudflare", "Yes, on Cloudflare"],
];

// Opens Cloudflare's Workers page: there the owner picks the builder and its Domains tab.
const Workers = ({ children }: { children: React.ReactNode }) => (
  <a href={WORKERS} target="_blank" rel="noopener">
    {children} ↗
  </a>
);

// Where the site lives: its address, the owner's own domain (with the way there from each
// starting point), and the Google Maps listing people find it through.
export function Address({ site, onSite }: { site: SiteDetail; onSite: (s: SiteDetail) => void }) {
  const at = `/api/sites/${site.id}`;
  const [have, setHave] = useState<Have | null>(null);
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [google, setGoogle] = useState(String(site.doc.business.google_url ?? ""));

  const connect = async (value: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const s = await api<SiteDetail>(`${at}/settings`, { method: "PUT", body: JSON.stringify({ domain: value }) });
      onSite(s);
      setDomain("");
      setMsg(value ? { ok: true, text: t(s.published ? "Your site now opens at {address}. The old address sends visitors there." : "Your site now opens at {address}. The old address sends visitors there once you publish.", { address: s.address }) } : { ok: true, text: t("Your site is back on its Dozokit Sites address.") });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
    setBusy(false);
  };

  return (
    <div className="settings">
      <section className="page-section">
        <h2>{t("Where your site is")}</h2>
        <p className="lead">{site.published ? t("Visitors find it at this address:") : t("It will be at this address once you publish it:")}</p>
        <AddressLine url={site.address} href={site.address + "/"} />
      </section>

      <section className="page-section">
        <h2>{t("Your own domain")}</h2>
        {site.domain ? (
          <>
            <p className="lead">{t("Your site is on {domain}. Its other address sends visitors there.", { domain: site.domain })}</p>
            <div className="field-actions">
              <button className="btn btn--quiet" type="button" disabled={busy} onClick={() => connect("")}>
                {t("Remove the domain")}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="lead">{t("An address like martin-plomberie.fr, with HTTPS. Do you have a domain?")}</p>
            <div className="seg" role="group" aria-label={t("Do you have a domain?")}>
              {HAVE.map(([k, label]) => (
                <button key={k} type="button" aria-pressed={have === k} onClick={() => setHave(k)}>
                  {t(label)}
                </button>
              ))}
            </div>

            {have === "none" && (
              <ol className="first-steps">
                <li>
                  <Workers>{t("Open Workers & Pages in Cloudflare")}</Workers>
                  {rich(t(", click **dozokit-sites** (the name you gave it), then the **Domains** tab."))}
                </li>
                <li>{rich(t("Choose **Buy a domain**. Cloudflare sells it at cost price, about $10 a year for a .com, and connects it to Dozokit Sites by itself."))}</li>
                <li>{t("Type it below and click Check and connect.")}</li>
              </ol>
            )}
            {have === "elsewhere" && (
              <ol className="first-steps">
                <li>
                  <a href={ONBOARD} target="_blank" rel="noopener">
                    {t("Add it to Cloudflare")} ↗
                  </a>
                  {rich(t(": click **Onboard a domain**, type it and pick the **Free** plan."))}
                </li>
                <li>{t("Where you bought it (OVH, GoDaddy, IONOS…), replace its nameservers with the two Cloudflare shows. It takes from a few minutes to a day; Cloudflare emails you when it's done.")}</li>
                <li>
                  <Workers>{t("Open Workers & Pages in Cloudflare")}</Workers>
                  {rich(t(", click **dozokit-sites**, then **Domains**, and add your domain as an existing domain."))}
                </li>
                <li>{t("Type it below and click Check and connect.")}</li>
              </ol>
            )}
            {have === "cloudflare" && (
              <ol className="first-steps">
                <li>
                  <Workers>{t("Open Workers & Pages in Cloudflare")}</Workers>
                  {rich(t(", click **dozokit-sites**, then **Domains**, and add your domain as an existing domain."))}
                </li>
                <li>{t("Type it below and click Check and connect.")}</li>
              </ol>
            )}

            {have && (
              <form
                className="field-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  connect(domain);
                }}
              >
                <label className="field">
                  <span>{t("Your domain")}</span>
                  <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="martin-plomberie.fr" spellCheck={false} required />
                </label>
                <div className="field-actions">
                  <button className="btn btn--ink" type="submit" disabled={busy || !domain.trim()}>
                    {busy ? t("Checking…") : t("Check and connect")}
                  </button>
                </div>
              </form>
            )}
            <p className="help">{t("Or let Claude walk you through it, and connect it once it's added in Cloudflare:")}</p>
            <PromptBox text={t("Help me put my Dozokit site {id} ({name}) on my own domain.", { id: site.id, name: site.doc.business.name })} />
          </>
        )}
        <p className={msg && !msg.ok ? "help help--error" : "help"} role="status">
          {msg?.text ?? ""}
        </p>
      </section>

      <Form
        title={t("Google Maps")}
        saved={site.published ? t("Saved and online.") : t("Saved. It goes online with your site when you publish it.")}
        help={t("The link to this business on Google Maps (on Google Maps, Share → Copy link). Your site's Directions and Leave a review buttons open it, and Google ties your site to your listing.")}
        onSave={async () => onSite(await api<SiteDetail>(`${at}/text`, { method: "PUT", body: JSON.stringify({ path: "business.google_url", value: google.trim(), note: t("Google Maps link") }) }))}
      >
        <label className="field">
          <span>{t("Google Maps link")}</span>
          <input value={google} onChange={(e) => setGoogle(e.target.value)} placeholder="https://maps.app.goo.gl/…" spellCheck={false} />
        </label>
      </Form>
    </div>
  );
}
