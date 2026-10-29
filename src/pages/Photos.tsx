import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { rich, t } from "../lib/i18n";
import qrcode from "qrcode-generator";
import { listPhotos, uploadPhoto, type Photo } from "../lib/photos";

const FROM: Record<string, string> = { upload: "Uploaded", website: "From your old site", page: "On the page" };
const from = (s: string) => t(FROM[s] ?? s);

// Drop zone and file button: several photos at once, uploaded one after the other.
function Uploader({ siteId, onDone }: { siteId: number; onDone: (p: Photo[], id: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const send = async (files: File[]) => {
    setError(null);
    for (const [i, f] of files.filter((f) => f.type.startsWith("image/")).entries()) {
      setBusy(t("Adding {i} of {n}…", { i: i + 1, n: files.length }));
      try {
        const out = await uploadPhoto(siteId, f);
        onDone(out.photos, out.id);
      } catch (err) {
        setError((err as Error).message);
      }
    }
    setBusy(null);
  };
  return (
    <div
      className={`dropzone${over ? " is-over" : ""}`}
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => (e.preventDefault(), setOver(false), send(Array.from(e.dataTransfer.files)))}
    >
      <p>{busy ?? t("Drop photos here, or")}</p>
      <label className="btn btn--ink">
        {t("Choose photos")}
        <input type="file" accept="image/*" multiple hidden onChange={(e) => send(Array.from(e.target.files ?? []))} />
      </label>
      <p className={error ? "help help--error" : "help"}>{error ?? t("JPG, PNG or WebP. They're resized for the web as they upload.")}</p>
    </div>
  );
}

// A QR code for a 30-minute upload link: the owner adds photos straight from their phone, and
// the library here refreshes while it's open.
function FromPhone({ siteId, onList }: { siteId: number; onList: (p: Photo[]) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    const every = setInterval(() => listPhotos(siteId).then(onList, () => {}), 5000);
    const stop = setTimeout(() => setUrl(null), 30 * 60_000);
    return () => (clearInterval(every), clearTimeout(stop));
  }, [url, siteId, onList]);
  const qr = (u: string) => {
    const q = qrcode(0, "M");
    q.addData(u);
    q.make();
    return q.createSvgTag({ cellSize: 5, margin: 2 });
  };
  return (
    <div className="phone">
      <h3>{t("From your phone")}</h3>
      {url ? (
        <>
          <div className="phone-qr" dangerouslySetInnerHTML={{ __html: qr(url) }} />
          <p className="help">{t("Scan it with your phone's camera, then choose photos. They appear here as they arrive. The link works for 30 minutes, no password needed.")}</p>
        </>
      ) : (
        <>
          <p className="help">{t("Your best photos are often on your phone. Show a code here, scan it, and send them straight from there.")}</p>
          <button type="button" className="btn btn--quiet" onClick={() => api<{ url: string }>(`/api/sites/${siteId}/phone`, { method: "POST" }).then((r) => setUrl(r.url), (e: Error) => setError(e.message))}>
            {t("Show the code")}
          </button>
          {error && <p className="help help--error">{error}</p>}
        </>
      )}
      <p className="help">{rich(t("Photos on Instagram or Facebook: download your own copy (in Instagram, **Accounts Center → Your information and permissions → Download your information**), then add them here."))}</p>
    </div>
  );
}

// The site's photo library, like WordPress's media library.
export function Photos({ siteId }: { siteId: number }) {
  const [list, setList] = useState<Photo[] | null>(null);
  const [open, setOpen] = useState<Photo | null>(null);
  const [alt, setAlt] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    listPhotos(siteId).then(setList, (e: Error) => setMsg(e.message));
  }, [siteId]);
  const pick = (p: Photo) => (setOpen(p), setAlt(p.alt), setMsg(null));

  return (
    <section className="page-section">
      <h2>{t("Your photos")}</h2>
      <p className="lead">{t("Upload as many as you like, then use them anywhere on your site: click a photo on the page in the editor and choose one. The description tells Google and screen readers what the photo shows.")}</p>
      <div className="add-photos">
        <Uploader siteId={siteId} onDone={(p) => setList(p)} />
        <FromPhone siteId={siteId} onList={setList} />
      </div>
      {list && !list.length && <p className="muted">{t("No photo yet.")}</p>}
      <ul className="library">
        {list?.map((p) => (
          <li key={p.id}>
            <button type="button" className={`lib-photo${open?.id === p.id ? " is-on" : ""}`} onClick={() => pick(p)} aria-label={p.alt || t("Photo without a description")}>
              <img src={`/img/${p.id}`} alt="" loading="lazy" />
              <span className="lib-meta">{p.used ? t("On the page") : from(p.source)}{!p.alt && t(" · no description")}</span>
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <div className="modal-back" onClick={() => setOpen(null)}>
          <section className="modal stock" role="dialog" aria-modal="true" aria-label={t("Photo")} onClick={(e) => e.stopPropagation()}>
            <img src={`/img/${open.id}`} alt="" className="lib-big" />
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setList(await api<Photo[]>(`/api/sites/${siteId}/photo`, { method: "PUT", body: JSON.stringify({ id: open.id, alt }) }));
                setMsg(t("Saved."));
              }}
            >
              <label className="field">
                <span>{t("What it shows (for Google and screen readers)")}</span>
                <input value={alt} onChange={(e) => setAlt(e.target.value)} placeholder={t("Wedding bouquet of white roses on the shop counter")} />
              </label>
              <div className="pop-actions">
                <button className="btn btn--ink" type="submit">{t("Save")}</button>
                <button
                  className="btn btn--quiet"
                  type="button"
                  onClick={async () => {
                    try {
                      setList(await api<Photo[]>(`/api/sites/${siteId}/photo`, { method: "DELETE", body: JSON.stringify({ id: open.id }) }));
                      setOpen(null);
                    } catch (err) {
                      setMsg((err as Error).message);
                    }
                  }}
                >
                  {t("Delete")}
                </button>
                <button className="btn btn--quiet" type="button" onClick={() => setOpen(null)}>{t("Close")}</button>
              </div>
              <p className="help" role="status">{msg ?? (open.used ? t("Your page uses this photo.") : "")}</p>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

// The editor's chooser: pick from the library, or upload one and use it at once.
export function PhotoPicker({ siteId, current, onPick, onClose }: { siteId: number; current?: string; onPick: (id: string) => void; onClose: () => void }) {
  const [list, setList] = useState<Photo[] | null>(null);
  useEffect(() => {
    listPhotos(siteId).then(setList, () => setList([]));
  }, [siteId]);
  return (
    <div className="modal-back" onClick={onClose}>
      <section className="modal modal--wide stock" role="dialog" aria-modal="true" aria-labelledby="pick-h" onClick={(e) => e.stopPropagation()}>
        <h2 id="pick-h">{t("Choose a photo")}</h2>
        <Uploader siteId={siteId} onDone={(_p, id) => onPick(id)} />
        <ul className="library library--pick">
          {/* The photo on the page now comes first, outlined in green. */}
          {list?.toSorted((a, b) => Number(b.id === current) - Number(a.id === current)).map((p) => (
            <li key={p.id}>
              <button type="button" className={`lib-photo${p.id === current ? " is-current" : ""}`} aria-current={p.id === current || undefined} onClick={() => onPick(p.id)} aria-label={p.alt || t("Photo")}>
                <img src={`/img/${p.id}`} alt="" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
        <div className="pop-actions">
          <button className="btn btn--quiet" type="button" onClick={onClose}>{t("Cancel")}</button>
        </div>
      </section>
    </div>
  );
}
